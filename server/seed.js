const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Models
const Exam = require('./questionanswer/models/Exam');
const Unit = require('./questionanswer/models/Unit');
const Topic = require('./questionanswer/models/Topic');
const Subtopic = require('./questionanswer/models/Subtopic');
const Question = require('./questionanswer/models/Question');
const User = require('./questionanswer/models/User');

// Sample data
const sampleExams = [
  {
    name: 'Judiciary Preliminary Exam',
    nameHindi: 'न्यायिक प्रारंभिक परीक्षा',
    description: 'Complete preparation for judiciary preliminary exams',
    icon: '⚖️',
    totalQuestions: 100
  },
  {
    name: 'Civil Judge Exam',
    nameHindi: 'सिविल जज परीक्षा',
    description: 'Specialized preparation for civil judge positions',
    icon: '👨‍⚖️',
    totalQuestions: 150
  }
];

const sampleUnits = [
  {
    name: 'Constitutional Law',
    nameHindi: 'संवैधानिक कानून',
    order: 1,
    description: 'Fundamental principles and articles'
  },
  {
    name: 'Criminal Law',
    nameHindi: 'आपराधिक कानून',
    order: 2,
    description: 'IPC, CrPC, and Evidence Act'
  }
];

const sampleTopics = [
  {
    name: 'Fundamental Rights',
    nameHindi: 'मौलिक अधिकार',
    order: 1,
    difficulty: 'medium',
    estimatedTime: 120
  },
  {
    name: 'Directive Principles',
    nameHindi: 'निदेशक तत्व',
    order: 2,
    difficulty: 'easy',
    estimatedTime: 90
  }
];

const sampleSubtopics = [
  {
    name: 'Right to Equality',
    nameHindi: 'समानता का अधिकार',
    order: 1
  },
  {
    name: 'Right to Freedom',
    nameHindi: 'स्वतंत्रता का अधिकार',
    order: 2
  }
];

const sampleQuestions = [
  {
    order: 1,
    questionHindi: 'समानता के अधिकार का क्या अर्थ है?',
    questionEnglish: 'What is the meaning of Right to Equality?',
    answerHindi: `समानता का अधिकार भारतीय संविधान के अनुच्छेद 14 से 18 तक में वर्णित है। यह राज्य को किसी व्यक्ति के विरुद्ध कानून के समक्ष समानता या कानूनों के समान संरक्षण से वंचित करने से रोकता है।

मुख्य प्रावधान:
1. अनुच्छेद 14: कानून के समक्ष समानता
2. अनुच्छेद 15: धर्म, मूल वंश, जाति, लिंग या जन्म स्थान के आधार पर भेदभाव का निषेध
3. अनुच्छेद 16: सार्वजनिक रोजगार के मामलों में अवसर की समानता
4. अनुच्छेद 17: अस्पृश्यता का अंत
5. अनुच्छेद 18: उपाधियों का अंत

यह अधिकार सकारात्मक भेदभाव की अनुमति देता है जैसे कि महिलाओं, बच्चों और पिछड़े वर्गों के लिए विशेष प्रावधान।`,
    
    answerEnglish: `The Right to Equality is enshrined in Articles 14 to 18 of the Indian Constitution. It prevents the State from denying any person equality before the law or equal protection of laws.

Key Provisions:
1. Article 14: Equality before law
2. Article 15: Prohibition of discrimination on grounds of religion, race, caste, sex or place of birth
3. Article 16: Equality of opportunity in matters of public employment
4. Article 17: Abolition of Untouchability
5. Article 18: Abolition of titles

This right permits positive discrimination such as special provisions for women, children, and backward classes.`,
    
    difficulty: 'medium',
    estimatedTime: 15,
    keywords: ['Equality', 'Article 14', 'Fundamental Rights', 'Discrimination'],
    caseLaws: [
      { name: 'State of West Bengal vs Anwar Ali Sarkar', citation: 'AIR 1952 SC 75' },
      { name: 'Indra Sawhney vs Union of India', citation: 'AIR 1993 SC 477' }
    ],
    isPremium: false
  }
];

async function seedDatabase() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/qna-platform');
    console.log('Connected to database for seeding');
    
    // Clear existing data
    await Question.deleteMany({});
    await Subtopic.deleteMany({});
    await Topic.deleteMany({});
    await Unit.deleteMany({});
    await Exam.deleteMany({});
    console.log('Cleared existing data');
    
    // Create exams
    const exams = await Exam.insertMany(sampleExams);
    console.log(`Created ${exams.length} exams`);
    
    // Create units for first exam
    const units = await Promise.all(
      sampleUnits.map((unitData, index) => 
        Unit.create({
          ...unitData,
          examId: exams[0]._id,
          order: index + 1
        })
      )
    );
    console.log(`Created ${units.length} units`);
    
    // Create topics for first unit
    const topics = await Promise.all(
      sampleTopics.map((topicData, index) =>
        Topic.create({
          ...topicData,
          unitId: units[0]._id,
          order: index + 1
        })
      )
    );
    console.log(`Created ${topics.length} topics`);
    
    // Create subtopics for first topic
    const subtopics = await Promise.all(
      sampleSubtopics.map((subtopicData, index) =>
        Subtopic.create({
          ...subtopicData,
          topicId: topics[0]._id,
          order: index + 1
        })
      )
    );
    console.log(`Created ${subtopics.length} subtopics`);
    
    // Create questions for first subtopic
    const questions = await Promise.all(
      sampleQuestions.map((questionData, index) =>
        Question.create({
          ...questionData,
          subtopicId: subtopics[0]._id,
          examId: exams[0]._id,
          order: index + 1,
          isReleased: true
        })
      )
    );
    console.log(`Created ${questions.length} questions`);
    
    // Create admin user
    const adminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    const adminUser = await User.create({
      email: process.env.ADMIN_EMAIL || 'admin@example.com',
      password: adminPassword,
      name: 'Admin User',
      role: 'admin',
      hasPremiumAccess: true
    });
    console.log('Created admin user:', adminUser.email);
    
    // Create test student user
    const studentPassword = await bcrypt.hash('student123', 10);
    const studentUser = await User.create({
      email: 'student@example.com',
      password: studentPassword,
      name: 'Test Student',
      role: 'student',
      hasPremiumAccess: false
    });
    console.log('Created test student user:', studentUser.email);
    
    console.log('✅ Database seeding completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Exams: ${exams.length}`);
    console.log(`   Units: ${units.length}`);
    console.log(`   Topics: ${topics.length}`);
    console.log(`   Subtopics: ${subtopics.length}`);
    console.log(`   Questions: ${questions.length}`);
    console.log(`   Users: 2 (1 admin, 1 student)`);
    console.log('\n🔑 Login Credentials:');
    console.log('   Admin: admin@example.com / admin123');
    console.log('   Student: student@example.com / student123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

// Run seeder
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
